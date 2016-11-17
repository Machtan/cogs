
import {Terminal, Diagnostic, DiagnosticCollection, window} from 'vscode';
import {LintCache} from './linter';
import {Target, findCrateRoot, findTarget} from './common';
import * as path from 'path';

export class Crate {
    root: string;
    terminal: Terminal;
    lintCache: LintCache;
    hasBeenLintedOnce: boolean;

    constructor(root: string, dia: DiagnosticCollection) {
        this.root = root;
        // NOTE: This uses the right user shell for me on Mac. Is that universal?
        let terminal = window.createTerminal("Rust: "+path.basename(root));
        let cdCmd = "cd "+root;
        terminal.sendText(cdCmd, true);
        terminal.hide();
        this.terminal = terminal;
        this.lintCache = new LintCache(dia);
        this.hasBeenLintedOnce = false;
    }

    dispose() {
        this.terminal.dispose();
    }
}

export class CrateManager {
    crates: Map<string, Crate>;
    dia: DiagnosticCollection;

    constructor(dia: DiagnosticCollection) {
        this.crates = new Map();
        this.dia = dia;
    }

    // Adds a new crate with the given root folder
    addCrate(root: string) {
        if (this.crates.has(root)) {
            throw `The crate at '${root}' was already added!`;
        }
        let crate = new Crate(root, this.dia);
        this.crates.set(root, crate);
    }

    // Updates the lints for the given target
    updateTarget(target: Target, lints: Map<string, Diagnostic[]>) {
        if (!this.crates.has(target.crateRoot)) {
            this.addCrate(target.crateRoot);
        }
        let crate = this.crates.get(target.crateRoot);
        crate.lintCache.updateTarget(target, lints);
        if (!crate.hasBeenLintedOnce) {
            let crateTarget = findTarget(crate.root, false);
            //console.log(`updateTarget: Checking if ${crateTarget} is ${target} -> ${target.eq(crateTarget)}`);
            if (target.eq(crateTarget)) {
                crate.hasBeenLintedOnce = true;
            }
        }
    }

    // Returns whether the given target has been linted in this session.
    hasLintsForTarget(target: Target): boolean {
        if (!this.crates.has(target.crateRoot)) {
            return false;
        }
        let crate = this.crates.get(target.crateRoot);
        return crate.lintCache.hasTarget(target);
    }

    // Returns whether the given file has been linted this session.
    // This only works if the file is the source file of an 'example', 'test' or 'binary' 
    // target.
    hasLintsForFile(filePath: string): boolean {
        let crateRoot = findCrateRoot(filePath);
        if (!this.crates.has(crateRoot)) {
            return false;
        }
        let crate = this.crates.get(crateRoot);
        return crate.lintCache.hasFile(filePath);
    }

    // Returns whether the main target for the crate at the given root has been linted in
    // this session.
    hasCrateBeenLinted(crateRoot: string): boolean {
        if (!this.crates.has(crateRoot)) {
            return false;
        }
        let crate = this.crates.get(crateRoot);
        return crate.hasBeenLintedOnce;
    }

    // Gets a terminal for the crate at the given root.
    getTerminal(crateRoot: string): Terminal {
        if (!this.crates.has(crateRoot)) {
            this.addCrate(crateRoot);
        }
        return this.crates.get(crateRoot).terminal;
    }

    // Clears all the lints for the given crate.
    clearLints(crateRoot: string) {
        if (!this.crates.has(crateRoot)) {
            return;
        }
        console.log("Clearing lints for crate '"+path.basename(crateRoot)+"'...");
        this.dia.forEach((uri, diagnostics) => {
            if (uri.fsPath.startsWith(crateRoot)) {
                this.dia.delete(uri);
            }
        });
    }

    dispose() {
        for (let [root, crate] of this.crates) {
            crate.dispose();
        }
        this.crates.clear();
    }
}