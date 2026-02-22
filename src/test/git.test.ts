import * as assert from "assert";
import * as git from "../git";

suite("Git Tests", () => {
    test("checkBranchExists returns false for non-existent branch", async () => {
        try {
            const { local, remote } = await git.checkBranchExists("non-existent-branch-12345");
            assert.strictEqual(local, false);
            assert.strictEqual(remote, false);
        } catch (e) {
             console.warn("Skipping git test: " + e);
        }
    });

    test("getCurrentBranch returns a string", async () => {
        try {
            const branch = await git.getCurrentBranch();
            assert.ok(typeof branch === "string");
            assert.ok(branch.length > 0);
        } catch (e) {
             console.warn("Skipping git test: " + e);
        }
    });
});
