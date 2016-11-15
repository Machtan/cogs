'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {window, commands, languages, workspace, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, DiagnosticCollection, TextEditor, TextEditorEdit, DocumentFilter} from 'vscode';
//import * as cap from './capabilities';
import {runLinterForProject, runLinterForExample} from './linter';
import {Settings} from './settings';
import {RustCompleter} from './suggestions';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {findCrateRoot} from './common';

let dia: DiagnosticCollection;
let bar: StatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
let hasRunLinterOnce = false;
let settings = new Settings();
const RUST_MODE: DocumentFilter = {language: 'rust', scheme: 'file'};
//let capabilities: cap.Capabilities;


export function isExample(filename: string): boolean {
    let crate = findCrateRoot(filename);
    let exampleDirPrefix = path.join(crate, "example", "");
    if (filename.startsWith(exampleDirPrefix)) {
        if (!filename.endsWith(".rs")) {
            return false;
        }
        return true;
    } else {
        return false;
    }
}

export function runLinter(filename: string) {
    //window.showInformationMessage("Filename: "+ editor.document.fileName);
    let crate = findCrateRoot(filename);
    if (crate !== null) {
        //window.showInformationMessage("Crate root: "+crate);
        if (isExample(filename)) {
            let example = path.basename(filename, ".rs");
            console.log(`Linting example '${example}'!`);
            runLinterForExample(example, crate, dia);
        } else {
            console.log(`Linting project at '${crate}'`);
            runLinterForProject(crate, dia);
        }
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

    // Add autocomplete


    // Check if the project should be Linted
    // This might be 'false' if the extension is activated through running one of its
    // registered commands, eg. 'rust.run'
    if ((window.activeTextEditor && window.activeTextEditor.document.languageId === "rust")) {
        runLinter(window.activeTextEditor.document.fileName);
        hasRunLinterOnce = true;
    } else if (workspaceIsCargoProject()) {
        runLinter(path.join(workspace.rootPath, "Cargo.toml"));
        hasRunLinterOnce = true;
    }

    // ===== Register commands =====

    context.subscriptions.push(commands.registerTextEditorCommand('cogs.run', () => {
        let srcpath = child_process.execSync("echo $RUST_SRC_PATH");
        window.showInformationMessage("RUST_SRC_PATH: "+srcpath);
        //window.showInformationMessage('unimplemented!();');
    }));

    context.subscriptions.push(commands.registerTextEditorCommand('cogs.runLinter', (editor, edit) => {
        console.log("CMD: cogs.runLinter");
        runLinter(editor.document.fileName);
    }));

    // ===== Add listeners =====

    context.subscriptions.push(workspace.onDidSaveTextDocument(document => {
        //window.showInformationMessage("Language ID: '"+document.languageId+"' lint on save: "+settings.runLinterOnSave);
        if (((document.languageId === "rust") || isCargoFile(document)) && settings.runLinterOnSave) {
            //window.showInformationMessage("Saved rust document!");
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
            } else if ( // This is an unlinted example document
                isExample(editor.document.fileName) && 
                (dia.get(editor.document.uri) === undefined)
            ) {
                console.log("Linting unlinted example document");
                runLinter(editor.document.fileName);
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

    /*context.subscriptions.push(workspace.onDidChangeTextDocument(event => {
        console.log("DocumentChangeEvent:");
        event.contentChanges.forEach(change => {
            console.log("- "+change.text);
        });
    }));*/

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