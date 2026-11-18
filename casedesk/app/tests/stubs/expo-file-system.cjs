// Test double for expo-file-system: a documents folder whose container path can change
// (as iOS does on app updates). Files: globalThis.__fsFiles = [{ name, mtime? }].
const g = globalThis;
g.__fsDeleted = g.__fsDeleted || [];
const root = () => g.__fsRoot || 'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/';
class File {
  constructor(dir, name) { this.uri = typeof dir === 'string' ? dir : dir.uri + name; this.name = this.uri.split('/').pop(); this.exists = true; }
  get modificationTime() { const f = (g.__fsFiles || []).find((x) => x.name === this.name); return f ? f.mtime ?? null : null; }
  delete() { g.__fsDeleted.push(this.uri); }
  create() {}
  async write() {}
  async base64() { return 'AAAA'; }
}
class Directory {
  constructor(base, name) { this.uri = root() + name + '/'; this.exists = true; }
  create() {}
  list() { return (g.__fsFiles || []).map((f) => new File(this, f.name)); }
}
module.exports = { File, Directory, Paths: { get document() { return root(); }, get cache() { return root(); } } };
