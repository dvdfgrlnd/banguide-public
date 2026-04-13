/**
 * Archive Import Module
 * Expands .tar/.tar.gz/.tgz uploads into a flat list of File objects for import.
 */

function basename(fileName) {
  return String(fileName || '').split('/').pop() || '';
}

function isTarArchiveName(fileName) {
  const lower = String(fileName || '').toLowerCase();
  return lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz');
}

function guessMimeType(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function parseTarSize(headerBytes) {
  const raw = new TextDecoder().decode(headerBytes).replace(/\0/g, '').trim();
  if (!raw) return 0;
  const size = parseInt(raw, 8);
  return Number.isFinite(size) && size >= 0 ? size : 0;
}

function parseTarEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const entries = [];
  let offset = 0;

  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    const isEndBlock = header.every((byte) => byte === 0);
    if (isEndBlock) {
      break;
    }

    const name = new TextDecoder().decode(header.subarray(0, 100)).replace(/\0.*$/, '');
    const prefix = new TextDecoder().decode(header.subarray(345, 500)).replace(/\0.*$/, '');
    const typeFlag = header[156];
    const size = parseTarSize(header.subarray(124, 136));
    const fullName = prefix ? `${prefix}/${name}` : name;

    const dataStart = offset + 512;
    const dataEnd = dataStart + size;

    // Include only regular files; skip directories and metadata blocks.
    if ((typeFlag === 0 || typeFlag === 48) && fullName && size > 0 && dataEnd <= bytes.length) {
      const payload = bytes.slice(dataStart, dataEnd);
      entries.push({
        path: fullName,
        file: new File([payload], basename(fullName), { type: guessMimeType(fullName) })
      });
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  return entries;
}

export async function expandImportFiles(files) {
  const list = Array.from(files || []);
  if (list.length !== 1 || !isTarArchiveName(list[0].name)) {
    return list;
  }

  const archive = list[0];
  const lowerName = archive.name.toLowerCase();

  let tarBuffer;
  if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz')) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser does not support .tar.gz import yet. Use folder import instead.');
    }
    const decompressed = archive.stream().pipeThrough(new DecompressionStream('gzip'));
    tarBuffer = await new Response(decompressed).arrayBuffer();
  } else {
    tarBuffer = await archive.arrayBuffer();
  }

  return parseTarEntries(tarBuffer).map((entry) => {
    Object.defineProperty(entry.file, '__archivePath', {
      value: entry.path,
      enumerable: false,
      configurable: false
    });
    return entry.file;
  });
}
