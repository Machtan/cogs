import * as path from 'path';
import {findCrateRoot} from './common';
import {window, workspace, commands, Diagnostic, DiagnosticCollection, DiagnosticSeverity, StatusBarItem, ExtensionContext, StatusBarAlignment, Uri, Selection, Position, Range} from 'vscode';

class CrateLints {
    constructor(public root: string, public lints: LintSource[], public errors: number, public warnings: number) {}
}

interface LintSource {
    diagnostic: Diagnostic,
    filePath: string,
}

export class LintStatusBar {
    bar: StatusBarItem;
    dia: DiagnosticCollection;
    crate: CrateLints;
    currentShownLintIndex: number;
    errors: number;
    warnings: number;
    currentFilePath: string;

    // Initializes the bar and its crap.
    constructor(context: ExtensionContext, dia: DiagnosticCollection) {
        this.currentShownLintIndex = 0;
        this.errors = 0;
        this.warnings = 0;
        this.dia = dia;
        this.currentFilePath = "";
        context.subscriptions.push(commands.registerCommand('fancyLint.showFiles', () => {
            //this.showErrorFiles();
            this.gotoNextCrateLint();
        }));
        this.bar = window.createStatusBarItem(StatusBarAlignment.Left, 2);
        this.bar.command = "fancyLint.showFiles";
        this.bar.tooltip = "Reveal next problem";
        this.crate = new CrateLints("", [], 0, 0);
        context.subscriptions.push(this.bar);
        if (window.activeTextEditor) {
            this.updateCurrentFile(window.activeTextEditor.document.fileName);
        } else {
            this.updateText();
        }
        this.bar.show();
    }

    // Updates the data for the crate that contains the given path, if necessary
    updateCrateLintsIfNew(filePath: string) {
        this.currentFilePath = filePath;
        let crateRoot = findCrateRoot(filePath);
        if (crateRoot !== this.crate.root) {
            this.updateCrateLints(filePath);
        }
        this.updateText();
    }

    // Forcefully updates the data for the crate that contains the given path.
    updateCrateLints(filePath: string) {
        this.currentFilePath = filePath;
        let crateRoot = findCrateRoot(filePath);
        console.log("CRATE => "+path.basename(crateRoot));
        let errorCount = 0;
        let warningCount = 0;
        let errors = [];
        let warnings = [];
        this.dia.forEach((uri, diagnostics) => {
            console.log(`'${uri.fsPath}' startsWith '${crateRoot}' -> ${uri.fsPath.startsWith(crateRoot)}`);
            if (uri.fsPath.startsWith(crateRoot)) {
                diagnostics.forEach(diagnostic => {
                    if (diagnostic.severity === DiagnosticSeverity.Error) {
                        errorCount += 1;
                        errors.push({diagnostic: diagnostic, filePath: uri.fsPath});
                        console.log("- error:  "+diagnostic.message);
                    } else if (diagnostic.severity === DiagnosticSeverity.Warning) {
                        warningCount += 1;
                        warnings.push({diagnostic: diagnostic, filePath: uri.fsPath});
                        console.log("- warning: "+diagnostic.message);
                    }
                });
            }
        });
        this.crate = new CrateLints(crateRoot, errors.concat(warnings), errorCount, warningCount);
        //console.log(`Errors/Warnings: (${errorCount}, ${warningCount}), lints: ${this.crate.lints}`);
        this.currentShownLintIndex = this.crate.lints.length - 1;
        this.updateCurrentFile(filePath);
    }

    // Recalculates the shown status text.
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

    // Updates the status shown for a newly changed-to document.
    updateCurrentFile(filePath: string) {
        this.updateCrateLintsIfNew(filePath);
        let diagnostics = this.dia.get(Uri.file(filePath));
        this.errors = 0;
        this.warnings = 0;
        if (diagnostics !== undefined) {
            diagnostics.forEach(diagnostic => {
                if (diagnostic.severity === DiagnosticSeverity.Error) {
                    this.errors += 1;
                } else if (diagnostic.severity === DiagnosticSeverity.Warning) {
                    this.warnings += 1;
                }
            });
            this.updateText();
        } else {
            this.updateText();
        }
    }

    // Hides the lint status bar
    hide() {
        this.bar.hide();
    }

    // Shows the lint status bar
    show() {
        this.bar.show();
    }

    gotoFileAndPos(filePath: string, range: Range) {
        console.log(`Revealing ${filePath}:${range.start.line+1}:${range.start.character+1}`);
        workspace.openTextDocument(filePath as string).then(document => {
            window.showTextDocument(document).then(editor => {
                editor.revealRange(range);//, TextEditorRevealType.InCenter);
                //editor.selection = new Selection(range.start, range.start);
            })
        });
    }

    gotoNextCrateLint() {
        if ((this.crate.errors + this.crate.warnings) == 0) {
            return;
        }
        let index = (this.currentShownLintIndex + 1 % this.crate.lints.length);
        //console.log(`Old/new index: (${this.currentShownLintIndex}, ${index})`);
        this.currentShownLintIndex = index;
        let lint = this.crate.lints[index];
        //console.log("Lints: "+this.crate.lints);
        this.gotoFileAndPos(lint.filePath, lint.diagnostic.range);
    }

    // Shows a list of linted files with errors and warnings to choose between and go to
    showErrorFiles() {
        let picks = [];
        this.dia.forEach((uri, diagnostics) => {
            if (diagnostics.length === 0) {
                return;
            }
            // Show only the files in the current crate.
            if (!uri.fsPath.startsWith(this.crate.root)) {
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
    
