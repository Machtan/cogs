'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {window, commands, languages, workspace, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, DiagnosticCollection, TextEditor, TextEditorEdit} from 'vscode';
//import * as cap from './capabilities';
import {runLinterForProject} from './diagnostics';
import {Settings} from './settings';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let dia: DiagnosticCollection;
let bar: StatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
let hasRunLinterOnce = false;
let settings = new Settings();
//let capabilities: cap.Capabilities;

export function findCrateRoot(memberFilePath: string): string | null {
    // Start at least above 'src'
    let dir = path.dirname(path.dirname(memberFilePath));
    while (dir != "") {
        if (fs.existsSync(path.join(dir, "cargo.toml"))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    return null;
}

export function runLinter(filename: string) {
    //window.showInformationMessage("Filename: "+ editor.document.fileName);
    let crate = findCrateRoot(filename);
    if (crate !== null) {
        //window.showInformationMessage("Crate root: "+crate);
        runLinterForProject(crate, dia);
        updateLastLintTime();
    } else {
        window.showErrorMessage("No cargo project found");
    }
}

function updateLastLintTime() {
    let now = new Date();
    bar.text = `$(rocket) Linted at ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
}

// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    
    // ===== Setup =====

    const defaultBarText = "$(rocket) Cogs Activated";
    bar.text = defaultBarText;
    bar.show();

    // Create a new diagnostics collection (lints for each file)
    dia = languages.createDiagnosticCollection('rust');
    context.subscriptions.push(dia);

    // Create a new capabilities list
    // capabilities = new cap.Capabilities();

    // Create aliases for registering commands
    let registerCommand = function(command: string, callback: (args: any[]) => any, thisArg?: any): void {
        context.subscriptions.push(commands.registerCommand(command, callback, thisArg));
    };
    let registerTextEditorCommand = function(command: string, callback: (textEditor: TextEditor, edit: TextEditorEdit, args: any[]) => void, thisArg?: any): void {
        context.subscriptions.push(commands.registerTextEditorCommand(command, callback, thisArg));
    };

    // ===== Register commands =====

    // The command has been defined in the package.json file
    registerTextEditorCommand('cogs.run', () => {
        window.showInformationMessage('unimplemented!();');
    });

    registerTextEditorCommand('cogs.runLinter', (editor, edit) => {
        runLinter(editor.document.fileName);
    });

    // ===== Add listeners =====
    context.subscriptions.push(workspace.onDidSaveTextDocument(document => {
        if (document.fileName.endsWith(".rs") && settings.runLinterOnSave) {
            //window.showInformationMessage("Saved rust document!");
            runLinter(document.fileName);
        }
    }));

    context.subscriptions.push(workspace.onDidOpenTextDocument(document => {
        //window.showInformationMessage("Opened rust document: '" + document.fileName + "'");
        if (!hasRunLinterOnce) {
            runLinter(document.fileName);
            hasRunLinterOnce = true;
        }
    }));

    context.subscriptions.push(window.onDidChangeActiveTextEditor(editor => {
        if (editor === undefined) {
            return;
        }
        //window.showInformationMessage("Switched to rust document: '" + editor.document.fileName + "'");
        if (!hasRunLinterOnce) {
            runLinter(editor.document.fileName);
            hasRunLinterOnce = true;
        }
    }));

    context.subscriptions.push(workspace.onDidChangeConfiguration(e => {
        settings.update();
    }))
}

// this method is called when your extension is deactivated
export function deactivate() {
}