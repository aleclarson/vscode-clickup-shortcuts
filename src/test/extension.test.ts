import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', async () => {
		const ext = vscode.extensions.getExtension('aleclarson.clickup-shortcuts');
		assert.ok(ext);
        // Activate it to ensure commands are registered (though they should be from package.json)
        if (!ext.isActive) {
            await ext.activate();
        }
	});

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const clickupCommands = commands.filter(c => c.startsWith('clickup-shortcuts'));

        assert.ok(clickupCommands.includes('clickup-shortcuts.listTasks'), 'listTasks command not found');
        assert.ok(clickupCommands.includes('clickup-shortcuts.checkoutTaskBranch'), 'checkoutTaskBranch command not found');
    });
});
