import * as vscode from "vscode";
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {getProjectTargets, findCrateRoot, findTargetForFile, Target, TargetKind} from './common';
import {Range, Position, Diagnostic, DiagnosticCollection, DiagnosticSeverity, Uri} from 'vscode';

interface WSLintCache {
    // Files whose lints were updated last time a 'lib' target was built
    lastLibTargetFiles: string[];
    // If the project doesn't have a lib target it can't really use examples/tests
    // so this structure should be okay.

    // Targets that have already been linted and thus needn't be relinted on open
    otherLintedTargets: Set<string>;
}

export class LintCache {
    workspaces: Map<string, WSLintCache>;
    dia: DiagnosticCollection;

    constructor(dia: DiagnosticCollection) {
        this.workspaces = new Map();
        this.dia = dia;
    }

    updateTarget(target: Target, lints: Map<string, Diagnostic[]>) {
        let cache = this.getOrInsertWorkspace(target.crateRoot);
        switch (target.kind) {
            case TargetKind.Library: {
                for (let filePath of cache.lastLibTargetFiles) {
                    this.dia.delete(Uri.file(filePath));
                }
                // Clear the array in a roundabout way
                cache.lastLibTargetFiles.length = 0;
                break;
            }
            case TargetKind.Binary:
            case TargetKind.Example:
            case TargetKind.Test: {
                cache.otherLintedTargets.add(target.src_path);
                break;
            }
            default: {
                console.log("ERR: Unhandled target in 'updateTarget': "+target.kind);
            }
        }
        lints.forEach((diagnostics, filePath) => {
            this.dia.set(Uri.file(filePath), diagnostics);
            if (target.kind === TargetKind.Library) {
                cache.lastLibTargetFiles.push(filePath);
            }
        });
    }

    hasLintsForTarget(target: Target): boolean {
        if (!this.workspaces.has(target.crateRoot)) {
            return false;
        }
        let cache = this.workspaces.get(target.crateRoot);
        return cache.otherLintedTargets.has(target.src_path);
    }

    hasLintsForFile(filePath: string): boolean {
        let crateRoot = findCrateRoot(filePath);
        if (!this.workspaces.has(crateRoot)) {
            return false;
        }
        let cache = this.workspaces.get(crateRoot);
        return cache.otherLintedTargets.has(filePath);
    }

    getOrInsertWorkspace(crateRoot): WSLintCache {
        if (!this.workspaces.has(crateRoot)) {
            let cache = {lastLibTargetFiles: [], otherLintedTargets: new Set()};
            this.workspaces.set(crateRoot, cache);
            return cache;
        } else {
            return this.workspaces.get(crateRoot);
        }
    }

    hasLintsForWorkspace(crateRoot): boolean {
        return this.workspaces.has(crateRoot);
    }
}

export function runLinterForTarget(target: Target, cache: LintCache) {
    // execSync raises an error on statusCode != 0, and naturally rustc errors.
    let cmd = "cargo rustc --message-format json" + target.cargo_args() + " -- -Zno-trans";
    console.log(`Linter: RUN >> ${cmd}`);
    let output;
    try {
        output = child_process.execSync(cmd, {cwd: target.crateRoot}).toString("utf-8");
    } catch (e) {
        output = e.stdout.toString("utf-8");
    }

    let lints = parseDiagnosticsFromJsonLines(output, target.crateRoot);
    
    cache.updateTarget(target, lints);
}

function parseDiagnosticsFromJsonLines(lines: string, projectDir: string): Map<string, Diagnostic[]> {
    let map: Map<string, Diagnostic[]> = new Map();
    let lineno = 1;
    lines.split("\n").forEach(line => {
        console.log("Parsing line "+lineno);
        lineno += 1;
        if (line === "") {
            return;
        }
        let tree: any;
        try {
            tree = JSON.parse(line);
        } catch (e) {
            console.log("ERR: Could not parse JSON in line: "+line);
            return;
        }
        // Note: Use package_id to ensure this is in the current project?
        let tm = tree.message;
        let level = tm.level;
        let message = tm.message;
        if (message === "aborting due to previous error") {
            return;
        }

        let error_message = message;
        let primary = tm.spans.find(span => span.is_primary);
        let range: vscode.Range;
        if (primary === undefined) {
            // Do something. Assign it to the file?
            return;
        } else {
            range = new Range(
                primary.line_start-1, primary.column_start-1, 
                primary.line_end-1, primary.column_end-1
            );
        }

        //console.log("Finding a fitting error message");
        // Set the message for this diagnostic
        if (message == "mismatched types") {
            // Use the more complete description if possible
                if (tm.children.length == 2) {
                    error_message = tm.children[0].message + "\n" + tm.children[1].message;
                } else {
                    error_message = primary.label;
                }
        } else if (primary.label == "cannot borrow mutably") {
            error_message = message;
        } else {
            // It seems that this is correct more often than 'primary.label'
            error_message = message;
        }

        if (tm.code) {
            //error_message += "\n\nExplanation:" + tm.code.explanation;
        }

        let severity: DiagnosticSeverity;
        if (level === "error") {
            severity = DiagnosticSeverity.Error;
        } else if (level === "warning") {
            severity = DiagnosticSeverity.Warning;
        } else {
            console.log("ERR: Unhandled rust error level: "+level);
            severity = undefined;
        }

        let diagnostic = new Diagnostic(range, error_message, severity);
        // diagnostic.source = "check"; // The source takes up a lot of space :/
        if (tm.code) {
            diagnostic.code = tm.code.code;
        }

        console.log(`Linter: ${level}: ${error_message}`);

        //console.log("Adding diagnostic for: " + primary.file_name);
        let filename = path.join(projectDir, primary.file_name);
        //console.log("filename: "+filename);
        // Ensure that the erroring file is in this project at all.
        if (!fs.existsSync(filename)) {
            // Handle fatal errors
            if (severity == DiagnosticSeverity.Error) {
                vscode.window.showErrorMessage("Out-of-project error: "+line);
            } else {
                // Ignore out-of-project warnings.
                return;
            }
        }
        let diagnostics = map.get(filename);
        if (diagnostics === undefined) {
            map.set(filename, [diagnostic]);
        } else {
            diagnostics.push(diagnostic);
        }
    });
    return map;
}
