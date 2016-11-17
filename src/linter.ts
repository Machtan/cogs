import * as vscode from "vscode";
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {findProjectTargets, findCrateRoot, findTargetForFile, Target, TargetKind} from './common';
import {Range, Position, Diagnostic, DiagnosticCollection, DiagnosticSeverity, Uri} from 'vscode';
import {CrateManager} from './crates';


export class LintCache {
    dia: DiagnosticCollection;
    // Files whose lints were updated last time a 'lib' target was built
    lastLibTargetFiles: string[];
    // If the project doesn't have a lib target it can't really use examples/tests
    // so this structure should be okay.

    // Whether the cache has been run for a library
    hasLibraryLints: boolean;

    // Targets that have already been linted and thus needn't be relinted on open
    otherLintedTargets: Set<string>;

    constructor(dia: DiagnosticCollection) {
        this.dia = dia;
        this.lastLibTargetFiles = [];
        this.otherLintedTargets = new Set();
    }

    updateTarget(target: Target, lints: Map<string, Diagnostic[]>) {
        switch (target.kind) {
            case TargetKind.Library: {
                for (let filePath of this.lastLibTargetFiles) {
                    this.dia.delete(Uri.file(filePath));
                }
                // Clear the array in a roundabout way
                this.lastLibTargetFiles.length = 0;
                break;
            }
            case TargetKind.Binary:
            case TargetKind.Example:
            case TargetKind.Test: {
                this.otherLintedTargets.add(target.src_path);
                break;
            }
            default: {
                console.log("ERR: Unhandled target in 'updateTarget': "+target.kind);
            }
        }
        lints.forEach((diagnostics, filePath) => {
            this.dia.set(Uri.file(filePath), diagnostics);
            if (target.kind === TargetKind.Library) {
                this.lastLibTargetFiles.push(filePath);
            }
        });
    }

    hasFile(filePath: string): boolean {
        return this.otherLintedTargets.has(filePath);
    }

    hasTarget(target: Target): boolean {
        return this.otherLintedTargets.has(target.src_path);
    }
}

export function runLinterForTarget(target: Target, manager: CrateManager) {
    // execSync raises an error on statusCode != 0, and naturally rustc errors.
    let cmd = target.lint_command();
    console.log(`Linter: RUN >> ${cmd}`);
    let output;
    try {
        output = child_process.execSync(cmd, {cwd: target.crateRoot}).toString("utf-8");
    } catch (e) {
        output = e.stdout.toString("utf-8");
    }

    let lints = parseDiagnosticsFromJsonLines(output, target.crateRoot);
    
    manager.updateTarget(target, lints);
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
                // console.log("ERR: Out-of-project lint error:\n"+line);
                //vscode.window.showErrorMessage("Out-of-project error: "+error_message);
                filename = path.join(projectDir, "Cargo.toml");
                let crate = tree.target.name;
                let message = `External error: '${crate}':\n`;
                let file = path.basename(tree.target.src_path);
                let prefix = `${file}:${primary.line_start}:${primary.column_start}: `;
                message += prefix+"\n";
                for (let line of primary.text[0].text.split("\n")) {
                    message += "   " + line + "\n";
                }
                message += "error: " + error_message;
                diagnostic = new Diagnostic(new Range(0, 0, 0, 0), message, severity);
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
