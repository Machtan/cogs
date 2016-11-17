'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {window, commands, languages, workspace, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, DiagnosticSeverity, DiagnosticCollection, TextEditor, TextEditorEdit, DocumentFilter, Terminal, TextEditorRevealType, Selection} from 'vscode';
//import * as cap from './capabilities';
import {runLinterForTarget, LintCache} from './linter';
import {Settings} from './settings';
import {RustCompleter} from './suggestions';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {findCrateRoot, findTarget, TargetKind} from './common';
import {runOrBuild} from './run';
import {CrateManager} from './crates';
import {LintStatusHelper} from './fancyLint';

let bar: StatusBarItem;
let settings: Settings;
let manager: CrateManager;
let lintStatus: LintStatusHelper;

const RUST_MODE: DocumentFilter = {language: 'rust', scheme: 'file'};

export function runLinter(filePath: string) {
    //window.showInformationMessage("Filename: "+ editor.document.fileName);
    if (findCrateRoot(filePath)) {
        let target = findTarget(filePath, false);
        runLinterForTarget(target, manager);
        updateLastLintTime();
        lintStatus.updateStatus(filePath);
    } else {
        window.showErrorMessage(`No cargo project found for file '${filePath}'`);
    }
}

export function runLinterIfUnlinted(filePath: string) {
    if (findCrateRoot(filePath)) {
        let target = findTarget(filePath, false);
        if ((target.kind !== TargetKind.Library) && 
        (!manager.hasLintsForTarget(target))) {
            runLinterForTarget(target, manager); // TODO: reuse target
            updateLastLintTime();
            lintStatus.updateStatus(filePath);
        }
    } else {
        window.showErrorMessage(`No cargo project found for file '${filePath}'`);
    }
}

export function isCargoFile(doc: TextDocument): boolean {
    return path.basename(doc.fileName) === "Cargo.toml";
}

function hideBar(message: string) {
    //console.log(message + " -> hide");
    //window.showInformationMessage("Bar hidden!");
    bar.hide();
}

function showBar(message: string) {
    //console.log(message + " -> show");
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

    bar = window.createStatusBarItem(StatusBarAlignment.Left, 1);
    const defaultBarText = "$(rocket) Cogs Activated";
    bar.text = defaultBarText;
    showBar("Activate!");
    context.subscriptions.push(bar);
    

    // Create a new diagnostics collection (lints for each file)
    let dia = languages.createDiagnosticCollection('rust');
    settings = new Settings();
    manager = new CrateManager(dia);
    context.subscriptions.push(manager);
    context.subscriptions.push(dia);

    // Try the not-so-fancy linter extension (yay)
    lintStatus = new LintStatusHelper(context, dia)

    // Add autocomplete


    // Check if the project should be Linted
    // This might be 'false' if the extension is activated through running one of its
    // registered commands, eg. 'rust.run'
    if ((window.activeTextEditor && window.activeTextEditor.document.languageId === "rust")) {
        runLinter(window.activeTextEditor.document.fileName);
    } else {
        let crateRoot = findCrateRoot(workspace.rootPath);
        if (crateRoot) {
            runLinter(path.join(crateRoot, "Cargo.toml"));
        }
    }

    // ===== Register commands =====

    context.subscriptions.push(commands.registerTextEditorCommand('cogs.testCogs', () => {
        let srcpath = child_process.execSync("echo $RUST_SRC_PATH");
        window.showInformationMessage("RUST_SRC_PATH: "+srcpath);
        //window.showInformationMessage('unimplemented!();');
    }));

    context.subscriptions.push(commands.registerTextEditorCommand('cogs.run', 
    (editor, edit) => {
        console.log("CMD: cogs.run");
        let crateRoot = findCrateRoot(editor.document.fileName);
        if (crateRoot) {
            let terminal = manager.getTerminal(crateRoot);
            runOrBuild(editor.document.fileName, terminal);
        }
    }))

    context.subscriptions.push(commands.registerTextEditorCommand('cogs.runLinter', 
    (editor, edit) => {
        console.log("CMD: cogs.runLinter");
        runLinter(editor.document.fileName);
    }));

    context.subscriptions.push(commands.registerTextEditorCommand('cogs.clearLintsForCrate', 
    (editor, edit) => {
        console.log("CMD: cogs.clearLintsForCrate");
        let crateRoot = findCrateRoot(editor.document.fileName);
        if (crateRoot) {
            manager.clearLints(crateRoot);
        }
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
        let crateRoot = findCrateRoot(editor.document.fileName);
        if (!crateRoot) {
            hideBar("CAT: Crate root not found");
            return;
        }
        showBar("CAT: Crate root found");
        if (!manager.hasCrateBeenLinted(crateRoot)) {
            runLinter(editor.document.fileName);
        }
        if (editor.document.languageId === "rust") {
            // NOTE: This might not be necessary?
            runLinterIfUnlinted(editor.document.fileName);
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