// Module to do with running rust projects
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import {findCrateRoot, findTargetForFile, getProjectTargets, Target, TargetKind} from './common';

export function runOrBuild(filePath: string) {
    let crateRoot = findCrateRoot(filePath);
    let targets = getProjectTargets(crateRoot);
    if (targets.length === 0) {
        return;
    }
    let target = findTargetForFile(filePath, targets, true);
    let cmd = "cargo run" + target.cargo_args();
    if (cmd === "") {
        return;
    }
    console.log(`RUN >> ${cmd}`);
}