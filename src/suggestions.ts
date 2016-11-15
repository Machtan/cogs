import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {findCrateRoot} from './common';
import {window, CompletionItemProvider, TextDocument, Position, CancellationToken, CompletionItem, CompletionList} from 'vscode';

function isValidCompletionSource(path: string): boolean {
    return true;
}

export class RustCompleter implements CompletionItemProvider {
    provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): CompletionItem[] | Thenable<CompletionItem[]> | CompletionList | Thenable<CompletionList> {
        let text = document.getText();
        let command = `racer -i tab-text complete ${position.line+1} ${position.character+1} -`;
        let cwd = findCrateRoot(document.fileName);
        let options =  {cwd: cwd, input: text};
        let output: string;
        try {
            output = child_process.execSync(command, options).toString("utf-8");
        } catch (e) {
            window.showErrorMessage("Racer failed!");
            console.log("Racer error. Output:");
            console.log(e.stdout.toString("utf-8"));
            return undefined;
        }
        let completions = [];
        output.split("\n").forEach(line => {
            let [otype, mstr, linenum, charnum, path, mtype, context] = line.split("\t");
            if (otype === "MATCH") {
                if (!isValidCompletionSource(path)) {
                    return;
                }
            }
        });
        return undefined;
    }
}