import * as vscode from "vscode";
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {Range, Position, Diagnostic, DiagnosticCollection, DiagnosticSeverity, Uri} from 'vscode';

// Note: This function doesn't clear the diagnostics, but just adds the ones for the
// Current file. 
export function runLinterForExample(example: string, projectDir: string, dia: DiagnosticCollection) {
    let stdoutput: string;
    try {
        //console.log("Running linter in dir: '"+projectDir+"'");
        let cmd = `cargo rustc --example ${example} --message-format json -- -Zno-trans`;
        console.log(`Linter: RUN: '${cmd}'`);
        stdoutput = child_process.execSync(cmd, {cwd: projectDir}).toString("utf-8");
    } catch (e) {
        //vscode.window.showInformationMessage("Linter failed: " + e);
        stdoutput = e.stdout.toString("utf-8");
    }
    //console.log("Stdout:\n"+stdoutput);
    let map = parseDiagnosticsFromJsonLines(stdoutput, projectDir);
    
    // Don't clear the diagnostics, just add the diagnostic for the example.
    map.forEach((diagnostics, filepath) => {
        //console.log("Setting the diagnostics for file: '"+filepath+"'");
        dia.set(Uri.file(filepath), diagnostics);
    });
}

export function runLinterForProject(projectDir: string, dia: DiagnosticCollection) {
    // execSync raises an error on statusCode != 0, and naturally rustc errors.
    let stdoutput: string;
    try {
        //console.log("Running linter in dir: '"+projectDir+"'");
        let cmd = "cargo check --message-format json";
        console.log(`Linter: RUN: '${cmd}'`);
        stdoutput = child_process.execSync(cmd, {cwd: projectDir}).toString("utf-8");
    } catch (e) {
        //vscode.window.showInformationMessage("Linter failed: " + e);
        stdoutput = e.stdout.toString("utf-8");
    }

    let map = parseDiagnosticsFromJsonLines(stdoutput, projectDir);
    
    dia.clear();
    map.forEach((diagnostics, filepath) => {
        //console.log("Setting the diagnostics for file: '"+filepath+"'");
        dia.set(Uri.file(filepath), diagnostics);
    });
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
            console.log("Could not parse JSON in line: "+line);
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
            //console.log("Finding a fitting error message");
            // Set the message for this diagnostic
            if (message == "mistmatched types") {
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
        }
        let severity: DiagnosticSeverity;
        if (level === "error") {
            severity = DiagnosticSeverity.Error;
        } else if (level === "warning") {
            severity = DiagnosticSeverity.Warning;
        } else {
            console.log("Unhandled rust error level: "+level);
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

/*function onChange() {
  let uri = document.uri;
  check(uri.fsPath, goConfig).then(errors => {
    diagnosticCollection.clear();
    let diagnosticMap: Map<string, vscode.Diagnostic[]> = new Map();
    errors.forEach(error => {
      let canonicalFile = vscode.Uri.file(error.file).toString();
      let range = new vscode.Range(error.line-1, error.startColumn, error.line-1, error.endColumn);
      let diagnostics = diagnosticMap.get(canonicalFile);
      if (!diagnostics) { diagnostics = []; }
      diagnostics.push(new vscode.Diagnostic(range, error.msg, error.severity));
      diagnosticMap.set(canonicalFile, diagnostics);
    });
    diagnosticMap.forEach((diags, file) => {
      diagnosticCollection.set(vscode.Uri.parse(file), diags);
    });
  })
}*/