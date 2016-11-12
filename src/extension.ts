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
    // Support build.rs
    let dir = path.dirname(memberFilePath);
    while (dir != "") {
        if (fs.existsSync(path.join(dir, "Cargo.toml"))) {
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

export function workspaceIsCargoProject(): boolean {
    return (fs.existsSync(path.join(workspace.rootPath, "Cargo.toml")));
}

export function isCargoFile(doc: TextDocument): boolean {
    return path.basename(doc.fileName) == "Cargo.toml";
}

function hideBar(message: string) {
    console.log(message + " -> hide");
    //window.showInformationMessage("Bar hidden!");
    bar.hide();
}

function showBar(message: string) {
    console.log(message + " -> show");
    //window.showInformationMessage("Bar shown!");
    bar.show();
}

function updateLastLintTime() {
    let now = new Date();
    let hours = now.getHours() > 9? now.getHours(): "0"+now.getHours();
    let minutes = now.getMinutes() > 9? now.getMinutes(): "0"+now.getMinutes();
    let seconds = now.getSeconds() > 9? now.getSeconds(): "0"+now.getSeconds();
    bar.text = `$(rocket) Linted at ${hours}:${minutes}:${seconds}`;
}

// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    
    // ===== Setup =====

    const defaultBarText = "$(rocket) Cogs Activated";
    bar.text = defaultBarText;
    showBar("Activate!");

    // Create a new diagnostics collection (lints for each file)
    dia = languages.createDiagnosticCollection('rust');
    context.subscriptions.push(dia);

    // Check if the project should be Linted
    // This might be 'false' if the extension is activated through running one of its
    // registered commands, eg. 'rust.run'
    if (workspaceIsCargoProject()) {
        runLinter(path.join(workspace.rootPath, "Cargo.toml"));
        hasRunLinterOnce = true;
    } else if ((window.activeTextEditor && window.activeTextEditor.document.languageId === "rust")) {
        runLinter(window.activeTextEditor.document.fileName);
        hasRunLinterOnce = true;
    }

    // ===== Register commands =====

    context.subscriptions.push(commands.registerTextEditorCommand('cogs.run', () => {
        window.showInformationMessage('unimplemented!();');
    }));

    context.subscriptions.push(commands.registerTextEditorCommand('cogs.runLinter', (editor, edit) => {
        runLinter(editor.document.fileName);
    }));

    // ===== Add listeners =====

    context.subscriptions.push(workspace.onDidSaveTextDocument(document => {
        window.showInformationMessage("Language ID: '"+document.languageId+"' lint on save: "+settings.runLinterOnSave);
        if (((document.languageId === "rust") || isCargoFile(document)) && settings.runLinterOnSave) {
            window.showInformationMessage("Saved rust document!");
            runLinter(document.fileName);
        }
    }));

    // When: The active tab is changed
    // Notes: The editor is always unset before changing to a new document.
    // This means that it always becomes A => undefined => B
    // So you get change events for the editor becoming both 'undefined' and 'B'
    // when opening 'B'
    context.subscriptions.push(window.onDidChangeActiveTextEditor(editor => {
        if (editor === undefined) {
            //hideBar("CAT: The editor is undefined");
            // TODO: Check if any tabs are still open. hideBar if not
            return;
        }
        if (editor.document.languageId === "rust") {
            showBar("CAT: Language Id is Rust");
            //window.showInformationMessage("Switched to rust document: '" + editor.document.fileName + "'");
            if (!hasRunLinterOnce) {
                runLinter(editor.document.fileName);
                hasRunLinterOnce = true;
            }
        } else {
            if (workspaceIsCargoProject()) {
                if (!hasRunLinterOnce) {
                    runLinter(editor.document.fileName);
                    hasRunLinterOnce = true;
                }
                showBar("CAT: Workspace is Rust");
            } else {
                hideBar("CAT: Language Id and workspace is not rust, but " + editor.document.languageId);
            }
        }
    }));

    context.subscriptions.push(workspace.onDidChangeConfiguration(e => {
        settings.update();
    }))

    // When: A document in a workspace is opened (eg. open rsdl2, then open surface.rs)
    // Notes: It seems to have the wrong languageId, saying that Rust files are instead 
    // plaintext, though the file path is correct (and ends in .rs).
    /*context.subscriptions.push(workspace.onDidOpenTextDocument(document => {
        //window.showInformationMessage("Opened rust document: '" + document.fileName + "'");
        /*if (document.languageId === "rust") {
            showBar("OT: Language Id is Rust");
            if (!hasRunLinterOnce) {
                runLinter(document.fileName);
                hasRunLinterOnce = true;
            }
        } else {
            hideBar("OT: Language Id is not rust, but " + document.languageId + " path: "+document.fileName);
        }
    }));*/
}

// this method is called when your extension is deactivated
export function deactivate() {
}