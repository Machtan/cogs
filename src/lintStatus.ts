import * as path from 'path';
import {findCrateRoot} from './common';
import {window, workspace, commands, DiagnosticCollection, DiagnosticSeverity, StatusBarItem, ExtensionContext, StatusBarAlignment, Uri, Selection} from 'vscode';

class CrateLints {
    constructor(public root: string, public errors: number, public warnings: number) {}
}

export class LintStatusBar {
    bar: StatusBarItem;
    dia: DiagnosticCollection;
    crate: CrateLints;
    errors: number;
    warnings: number;

    // Initializes the bar and its crap.
    constructor(context: ExtensionContext, dia: DiagnosticCollection) {
        this.errors = 0;
        this.warnings = 0;
        this.dia = dia;
        context.subscriptions.push(commands.registerCommand('fancyLint.showFiles', () => {
            this.showErrorFiles();
        }));
        this.bar = window.createStatusBarItem(StatusBarAlignment.Left, 2);
        this.bar.command = "fancyLint.showFiles";
        this.bar.tooltip = "Show dirty files";
        this.crate = new CrateLints("", 0, 0);
        context.subscriptions.push(this.bar);
        if (window.activeTextEditor) {
            this.updateStatus(window.activeTextEditor.document.fileName);
        } else {
            this.updateText();
        }
        this.bar.show();
    }

    updateCrateLintsIfNew(filePath: string) {
        let crateRoot = findCrateRoot(filePath);
        if (crateRoot !== this.crate.root) {
            this.updateCrateLints(filePath);
        }
        this.updateText();
    }

    updateCrateLints(filePath: string) {
        let crateRoot = findCrateRoot(filePath);
        console.log("CRATE => "+path.basename(crateRoot));
        let errors = 0;
        let warnings = 0;
        this.dia.forEach((uri, diagnostics) => {
            console.log(`'${uri.fsPath}' startsWith '${crateRoot}' -> ${uri.fsPath.startsWith(crateRoot)}`);
            if (uri.fsPath.startsWith(crateRoot)) {
                diagnostics.forEach(diagnostic => {
                    if (diagnostic.severity === DiagnosticSeverity.Error) {
                        errors += 1;
                    } else if (diagnostic.severity === DiagnosticSeverity.Warning) {
                        warnings += 1;
                    }
                });
            }
        });
        this.crate = new CrateLints(crateRoot, errors, warnings);
        this.updateStatus(filePath);
    }

    updateText() {
        // Hack to somehow fix the fact that the crate count is wrong immediately after
        // linting a member file :/
        /*if (this.errors > this.crate.errors) {
            this.crate.errors = this.errors;
        }
        if (this.warnings >this.crate.warnings) {
            this.crate.warnings = this.warnings;
        }*/
        this.bar.text = `$(circle-slash) ${this.errors}/${this.crate.errors} $(alert) ${this.warnings}/${this.crate.warnings}`;
        console.log(`STATUS: Updating text => '${this.bar.text}'`);
    }

    updateStatus(filePath: string) {
        this.updateCrateLintsIfNew(filePath);
        let diagnostics = this.dia.get(Uri.file(filePath));
        this.errors = 0;
        this.warnings = 0;
        if (diagnostics !== undefined) {
            diagnostics.forEach(diagnostic => {
                if (diagnostic.severity = DiagnosticSeverity.Error) {
                    this.errors += 1;
                } else if (diagnostic.severity = DiagnosticSeverity.Warning) {
                    this.warnings += 1;
                }
            });
            this.updateText();
        } else {
            this.updateText();
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
    
