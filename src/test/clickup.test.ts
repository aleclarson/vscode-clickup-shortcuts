import * as assert from "assert";
import * as clickup from "../clickup";

suite("ClickUp API Tests", () => {
    // Mock global fetch
    const originalFetch = global.fetch;

    setup(() => {
        global.fetch = async (input: any, init?: any) => {
             const u = input.toString();
             if (u.includes("/user")) {
                 return {
                     ok: true,
                     json: async () => ({ user: { id: 123, username: "testuser" } })
                 } as Response;
             }
             if (u.includes("/space/space1/list")) {
                 return {
                     ok: true,
                     json: async () => ({ lists: [{ id: "l1", name: "List 1" }] })
                 } as Response;
             }
             if (u.includes("/space/space1/folder")) {
                 return {
                     ok: true,
                     json: async () => ({ folders: [{ id: "f1", name: "Folder 1", lists: [{ id: "l2", name: "List 2" }] }] })
                 } as Response;
             }
             return { ok: false, status: 404, text: async () => "Not Found" } as Response;
        };
    });

    teardown(() => {
        global.fetch = originalFetch;
    });

    test("getCurrentUser returns user", async () => {
        const user = await clickup.getCurrentUser("token");
        assert.strictEqual(user.id, 123);
        assert.strictEqual(user.username, "testuser");
    });

    test("getLists returns flattened lists", async () => {
        const lists = await clickup.getLists("space1", "token");
        assert.strictEqual(lists.length, 2);
        assert.strictEqual(lists[0].name, "List 1");
        // Check second list is from folder
        const list2 = lists.find(l => l.id === "l2");
        assert.ok(list2);
        assert.strictEqual(list2?.name, "Folder 1 > List 2");
    });
});
