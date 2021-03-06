// Module to do with running rust projects
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import {findTarget, findTargetForFile, findProjectTargets, Target, TargetKind} from './common';
import {Terminal} from 'vscode';

export function runOrBuild(filePath: string, terminal: Terminal) {
    let target = findTarget(filePath, true);
    console.log(`Run ${filePath} -> ${target}`);
    let cmd = target.run_command();
    console.log(`RUN >> ${cmd}`);
    terminal.show();
    terminal.sendText(cmd, true);
}