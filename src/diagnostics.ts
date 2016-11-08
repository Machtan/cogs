import * as vscode from "vscode";
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {Range, Position, Diagnostic, DiagnosticCollection, DiagnosticSeverity, Uri} from 'vscode';

export function runLinterForProject(projectDir: string, dia: DiagnosticCollection) {
    // execSync raises an error on statusCode != 0, and naturally rustc errors.
    let stdoutput: string;
    try {
        //console.log("Running linter in dir: '"+projectDir+"'");
        let cmd = "cargo check --message-format json";
        stdoutput = child_process.execSync(cmd, {cwd: projectDir}).toString("utf-8");
    }
    catch (e) {
        //vscode.window.showInformationMessage("Linter failed: " + e);
        stdoutput = e.stdout.toString("utf-8");
    }

    let map: Map<string, vscode.Diagnostic[]> = new Map();
    stdoutput.split("\n").forEach(line => {
        if (line === "") {
            return;
        }
        let tree: any;
        try {
            tree = JSON.parse(line);
        }
        catch (e) {
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
        let severity: DiagnosticSeverity;
        if (level === "error") {
            severity = DiagnosticSeverity.Error;
        } else if (level === "warning") {
            severity = DiagnosticSeverity.Warning;
        } else {
            console.log("Unhandled rust error level: "+level);
            severity = undefined;
        }

        let diagnostic = new Diagnostic(range, message, severity);
        diagnostic.source = "check";

        //console.log("Adding diagnostic for: " + primary.file_name);
        let filename = path.join(projectDir, primary.file_name);
        //console.log("filename: "+filename);
        // Ensure that the erroring file is in this project at all.
        if (!fs.existsSync(filename)) {
            return;
        }
        let diagnostics = map.get(filename);
        if (diagnostics === undefined) {
            map.set(filename, [diagnostic]);
        } else {
            diagnostics.push(diagnostic);
        }
    });
    dia.clear();
    map.forEach((diagnostics, filepath) => {
        //console.log("Setting the diagnostics for file: '"+filepath+"'");
        dia.set(Uri.file(filepath), diagnostics);
    });
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