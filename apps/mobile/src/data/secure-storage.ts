/** SecureStore refuses values over 2048 bytes; keep chunks safely below. */
export const CHUNK_SIZE = 1800;

export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface AsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Layout: values that fit are stored under `key` as-is. Larger values store
 * `chunks:<n>` under `key` and the pieces under `key.0 .. key.n-1`.
 */
const MARKER = "chunks:";

export function createChunkedStorage(store: KeyValueStore): AsyncStorage {
  async function chunkCount(key: string): Promise<number> {
    const head = await store.getItemAsync(key);
    if (head?.startsWith(MARKER)) {
      const n = Number(head.slice(MARKER.length));
      return Number.isInteger(n) && n > 0 ? n : 0;
    }
    return 0;
  }

  async function removeChunks(key: string) {
    const n = await chunkCount(key);
    for (let i = 0; i < n; i++) await store.deleteItemAsync(`${key}.${i}`);
  }

  return {
    async getItem(key) {
      const head = await store.getItemAsync(key);
      if (head === null || !head.startsWith(MARKER)) return head;
      const n = await chunkCount(key);
      if (n === 0) return null;
      let out = "";
      for (let i = 0; i < n; i++) {
        const part = await store.getItemAsync(`${key}.${i}`);
        if (part === null) return null;
        out += part;
      }
      return out;
    },
    async setItem(key, value) {
      await removeChunks(key);
      if (value.length <= CHUNK_SIZE && !value.startsWith(MARKER)) {
        await store.setItemAsync(key, value);
        return;
      }
      const n = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < n; i++) {
        await store.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      await store.setItemAsync(key, `${MARKER}${n}`);
    },
    async removeItem(key) {
      await removeChunks(key);
      await store.deleteItemAsync(key);
    },
  };
}
