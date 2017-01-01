import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {findCrateRoot} from './common';
import {window, CompletionItemProvider, TextDocument, Position, CancellationToken, CompletionItem, CompletionList, DocumentSymbolProvider, DocumentHighlight, SymbolInformation} from 'vscode';

function isValidCompletionSource(path: string): boolean {
    return true;
}

/*export class RacerDefinitionProvider implements DefinitionProvider {
    provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Definition | Definition[] {

    }
}*/

type ProviderResult<T> =  T | undefined | null | Thenable<T | undefined | null>;

/*export class RustsymProvider implements DocumentSymbolProvider {
    provideDocumentSymbols(document: TextDocument, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]> {
        let root = findCrateRoot(document.fileName);
        let cmd = `rustsym -g ${root}`;
        child_process.execSync(cmd);
    }
}*/

export class RacerProvider implements CompletionItemProvider {
    provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<CompletionItem[] | CompletionList> {
        return [];
    }
}

export function findRacerCompletions(document: TextDocument, position: Position) {
    let text = document.getText();
    let command = `racer -i tab-text complete ${position.line+1} ${position.character+1} -`;
    console.log("RUN >> "+command);
    let cwd = findCrateRoot(document.fileName);
    let options = {input: text};
    if (cwd !== "") {
        options['cwd'] = cwd;
    }
    
    let output: string;
    try {
        output = child_process.execSync(command, options).toString("utf-8");
    } catch (e) {
        window.showErrorMessage("Racer failed!");
        console.log("Racer error. Output:");
        console.log(e.stdout.toString("utf-8"));
        return undefined;
    }
    console.log("RACER output:\n"+output);
    let completions = [];
    output.split("\n").forEach(line => {
        let [otype, mstr, linenum, charnum, path, mtype, context] = line.split("\t");
        if (otype === "MATCH") {
            if (!isValidCompletionSource(path)) {
                return;
            }
        }
    });
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
        console.log("RACER output:\n"+output);
        let completions = [];
        output.split("\n").forEach(line => {
            let [otype, mstr, linenum, charnum, path, mtype, context] = line.split("\t");
            if (otype === "MATCH") {
                if (!isValidCompletionSource(path)) {
                    return;
                }
            }
        });
        return completions;
    }
}