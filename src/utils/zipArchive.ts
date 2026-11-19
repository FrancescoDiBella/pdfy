export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
  lastModified?: Date;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function deduplicateEntryNames(entries: ZipEntryInput[]): Array<{ name: string; data: Uint8Array; lastModified: Date }> {
  const used = new Set<string>();
  return entries.map((entry, idx) => {
    const clean = entry.name.replace(/^\/+/, '').trim() || `file_${idx + 1}`;
    let candidate = clean;
    if (used.has(candidate.toLowerCase())) {
      const dotIndex = clean.lastIndexOf('.');
      const stem = dotIndex > 0 ? clean.slice(0, dotIndex) : clean;
      const ext = dotIndex > 0 ? clean.slice(dotIndex) : '';
      let suffix = 2;
      while (used.has(`${stem}_${suffix}${ext}`.toLowerCase())) {
        suffix += 1;
      }
      candidate = `${stem}_${suffix}${ext}`;
    }
    used.add(candidate.toLowerCase());
    return {
      name: candidate,
      data: entry.data,
      lastModified: entry.lastModified ?? new Date(),
    };
  });
}

/**
 * Builds an uncompressed (Store method 0) PKZIP archive in pure TypeScript with
 * IEEE 802.3 CRC-32 checksums and UTF-8 filename flags (bit 11).
 */
export function createZipArchive(entries: ZipEntryInput[]): Uint8Array {
  if (entries.length === 0) {
    throw new Error('Cannot create an empty ZIP archive.');
  }

  const encoder = new TextEncoder();
  const normalized = deduplicateEntryNames(entries);

  interface PreparedEntry {
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    dosTime: number;
    dosDate: number;
    localHeaderOffset: number;
  }

  const prepared: PreparedEntry[] = [];
  let offset = 0;

  for (const item of normalized) {
    const nameBytes = encoder.encode(item.name);
    const { dosTime, dosDate } = encodeDosDateTime(item.lastModified);
    const crc = crc32(item.data);
    prepared.push({
      nameBytes,
      data: item.data,
      crc,
      dosTime,
      dosDate,
      localHeaderOffset: offset,
    });
    offset += 30 + nameBytes.length + item.data.length;
  }

  const centralDirectoryOffset = offset;
  let centralDirectorySize = 0;
  for (const item of prepared) {
    centralDirectorySize += 46 + item.nameBytes.length;
  }

  const totalSize = centralDirectoryOffset + centralDirectorySize + 22;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // 1. Write Local File Headers + raw file data
  let cursor = 0;
  for (const item of prepared) {
    view.setUint32(cursor, 0x04034b50, true); // Local file header signature
    view.setUint16(cursor + 4, 20, true); // Version needed to extract (2.0)
    view.setUint16(cursor + 6, 0x0800, true); // General purpose bit flag (UTF-8)
    view.setUint16(cursor + 8, 0, true); // Compression method: 0 (Store)
    view.setUint16(cursor + 10, item.dosTime, true);
    view.setUint16(cursor + 12, item.dosDate, true);
    view.setUint32(cursor + 14, item.crc, true);
    view.setUint32(cursor + 18, item.data.length, true); // Compressed size
    view.setUint32(cursor + 22, item.data.length, true); // Uncompressed size
    view.setUint16(cursor + 26, item.nameBytes.length, true);
    view.setUint16(cursor + 28, 0, true); // Extra field length
    output.set(item.nameBytes, cursor + 30);
    cursor += 30 + item.nameBytes.length;
    output.set(item.data, cursor);
    cursor += item.data.length;
  }

  // 2. Write Central Directory File Headers
  for (const item of prepared) {
    view.setUint32(cursor, 0x02014b50, true); // Central directory signature
    view.setUint16(cursor + 4, 20, true); // Version made by
    view.setUint16(cursor + 6, 20, true); // Version needed
    view.setUint16(cursor + 8, 0x0800, true); // UTF-8 filename flag
    view.setUint16(cursor + 10, 0, true); // Compression method: Store
    view.setUint16(cursor + 12, item.dosTime, true);
    view.setUint16(cursor + 14, item.dosDate, true);
    view.setUint32(cursor + 16, item.crc, true);
    view.setUint32(cursor + 20, item.data.length, true);
    view.setUint32(cursor + 24, item.data.length, true);
    view.setUint16(cursor + 28, item.nameBytes.length, true);
    view.setUint16(cursor + 30, 0, true); // Extra field length
    view.setUint16(cursor + 32, 0, true); // File comment length
    view.setUint16(cursor + 34, 0, true); // Disk number start
    view.setUint16(cursor + 36, 0, true); // Internal file attributes
    view.setUint32(cursor + 38, 0, true); // External file attributes
    view.setUint32(cursor + 42, item.localHeaderOffset, true);
    output.set(item.nameBytes, cursor + 46);
    cursor += 46 + item.nameBytes.length;
  }

  // 3. Write End of Central Directory Record (EOCD)
  view.setUint32(cursor, 0x06054b50, true); // EOCD signature
  view.setUint16(cursor + 4, 0, true); // Disk number
  view.setUint16(cursor + 6, 0, true); // Start disk
  view.setUint16(cursor + 8, prepared.length, true); // Entries on disk
  view.setUint16(cursor + 10, prepared.length, true); // Total entries
  view.setUint32(cursor + 12, centralDirectorySize, true);
  view.setUint32(cursor + 16, centralDirectoryOffset, true);
  view.setUint16(cursor + 20, 0, true); // Comment length

  return output;
}
