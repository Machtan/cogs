import * as path from 'path';
import {findCrateRoot} from './common';
import {window, workspace, commands, DiagnosticCollection, DiagnosticSeverity, StatusBarItem, ExtensionContext, StatusBarAlignment, Uri, Selection} from 'vscode';

export class LintStatusHelper {
    bar: StatusBarItem;
    dia: DiagnosticCollection;

    // Initializes the bar and its crap.
    constructor(context: ExtensionContext, dia: DiagnosticCollection) {
        this.dia = dia;
        context.subscriptions.push(commands.registerCommand('fancyLint.showFiles', () => {
            this.showErrorFiles();
        }));
        this.bar = window.createStatusBarItem(StatusBarAlignment.Left, 2);
        this.bar.command = "fancyLint.showFiles";
        this.bar.tooltip = "Show dirty files";
        context.subscriptions.push(this.bar);
        if (window.activeTextEditor) {
            this.updateStatus(window.activeTextEditor.document.fileName);
        } else {
            this.setFancyLintText(0, 0);
        }
        this.bar.show();

        context.subscriptions.push(window.onDidChangeActiveTextEditor(editor => {
            if (editor === undefined) {
                return;
            }
            //console.log("LSH: Changed editor to '"+editor.document.fileName+"'");
            this.updateStatus(editor.document.fileName);
        }))
    }

    setFancyLintText(errors: number, warnings: number) {
        this.bar.text = `-> $(circle-slash) ${errors} $(alert) ${warnings}`;
    }

    updateStatus(filePath: string) {
        let diagnostics = this.dia.get(Uri.file(filePath));
        if (diagnostics !== undefined) {
            let errors = 0;
            let warnings = 0;
            diagnostics.forEach(diagnostic => {
                if (diagnostic.severity = DiagnosticSeverity.Error) {
                    errors += 1;
                } else if (diagnostic.severity = DiagnosticSeverity.Warning) {
                    warnings += 1;
                }
            });
            this.setFancyLintText(errors, warnings);
        } else {
            this.setFancyLintText(0, 0);
        }
    }

    showErrorFiles() {
        let picks = [];
        this.dia.forEach((uri, diagnostics) => {
            if (diagnostics.length === 0) {
                return;
            }
            let errors = 0;
            let warnings = 0;
            let mainError;
            for (let diagnostic of diagnostics) {
                if (diagnostic.severity === DiagnosticSeverity.Error) {
                    errors += 1;
                    if (mainError === undefined || mainError.severity === DiagnosticSeverity.Warning) {
                        mainError = diagnostic;
                    } else if (mainError.severity === DiagnosticSeverity.Error) {
                        if (diagnostic.range < mainError.range) {
                            mainError = diagnostic;
                        }
                    }
                } else if (diagnostic.severity === DiagnosticSeverity.Warning) {
                    warnings += 1;
                    if (mainError === undefined) {
                        mainError = diagnostic;
                    } else if (mainError.severity === DiagnosticSeverity.Warning) {
                        if (diagnostic.range < mainError.range) {
                            mainError = diagnostic;
                        }
                    }
                }
            }
            let description = "";
            if (errors !== 0) {
                description += "Errors: "+errors+" ";
            }
            if (warnings !== 0) {
                description += "Warnings: "+warnings;
            }
            let crateRoot = findCrateRoot(uri.fsPath);
            let relPath = path.relative(crateRoot, uri.fsPath);
            let pick = {
                label: relPath,
                //detail: detail,
                description: description,
                errors: errors,
                warnings: warnings,
                filePath: uri.fsPath,
                range: mainError.range,
            };
            picks.push(pick);
        });
        picks.sort((a, b) => {
            if (a.errors > b.errors) {
                return -1;
            } else if (b.errors > a.errors) {
                return 1;
            }
            if (a.warnings > b.warnings) {
                return -1;
            } else if (b.warnings > a.warnings) {
                return 1;
            }
            return ( ( a.label == b.label ) ? 0 : ( ( a.label > b.label ) ? 1 : -1 ) );
        });
        
        window.showQuickPick(picks).then(pick => {
            if (pick === undefined) {
                return;
            }
            console.log("Picked option: "+pick.label);
            workspace.openTextDocument(pick.filePath as string).then(document => {
                window.showTextDocument(document).then(editor => {
                    editor.revealRange(pick.range);//, TextEditorRevealType.InCenter);
                    editor.selection = new Selection(pick.range.start, pick.range.start);
                })
            });
        })
    }
}
    
