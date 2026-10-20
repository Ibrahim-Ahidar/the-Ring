import { CHUNK_SIZE, createChunkedStorage, type KeyValueStore } from "./secure-storage";

function fakeStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
}

describe("createChunkedStorage", () => {
  it("stores small values in a single entry", async () => {
    const store = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem("session", "abc");
    expect(store.map.get("session")).toBe("abc");
    expect(await s.getItem("session")).toBe("abc");
  });

  it("returns null for a missing key", async () => {
    expect(await createChunkedStorage(fakeStore()).getItem("nope")).toBeNull();
  });

  it("splits values over the SecureStore limit and reassembles them", async () => {
    const store = fakeStore();
    const s = createChunkedStorage(store);
    const big = "x".repeat(CHUNK_SIZE * 2 + 17);
    await s.setItem("session", big);
    for (const v of store.map.values()) expect(v.length).toBeLessThanOrEqual(2048);
    expect(store.map.size).toBe(4);
    expect(await s.getItem("session")).toBe(big);
  });

  it("removes every chunk on removeItem", async () => {
    const store = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem("session", "y".repeat(CHUNK_SIZE * 3));
    await s.removeItem("session");
    expect(store.map.size).toBe(0);
    expect(await s.getItem("session")).toBeNull();
  });

  it("drops stale chunks when a smaller value overwrites a larger one", async () => {
    const store = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem("session", "z".repeat(CHUNK_SIZE * 3));
    await s.setItem("session", "small");
    expect(await s.getItem("session")).toBe("small");
    expect([...store.map.keys()]).toEqual(["session"]);
  });

  it("returns null if a chunk is missing", async () => {
    const store = fakeStore();
    const s = createChunkedStorage(store);
    await s.setItem("session", "q".repeat(CHUNK_SIZE * 2));
    store.map.delete("session.1");
    expect(await s.getItem("session")).toBeNull();
  });
});
