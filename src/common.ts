import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';

export enum TargetKind {
    Binary,
    Library,
    Example,
}

export interface Target {
    name: string,
    kind: TargetKind,
    src_path: string,
}

// Finds the targets of the project the given file is part of, using 'cargo metadata'
// TODO: Cache this and watch cargo.toml?
export function getProjectTargets(projectDir: string): Target[] {
    let output;
    let cmd = "cargo metadata --no-deps";
    console.log("RUN >> "+cmd);
    try {
        output = child_process.execSync(cmd, {cwd: projectDir}).toString("utf-8");
    } catch (e) {
        console.log(`ERR: Could not run '${cmd}' inside '${projectDir}'`);
        return [];
    }
    let tree = JSON.parse(output);
    let targets = [];
    tree.packages[0].targets.forEach(element => {
        
        let ekind = element.kind[0];
        let kind: TargetKind;
        if (ekind === "bin") {
            kind = TargetKind.Binary;
        } else if (ekind === "lib") {
            kind = TargetKind.Library;
        } else if (ekind === "example") {
            kind = TargetKind.Example;
        } else {
            console.log("ERR: UNSUPPORTED TARGET KIND: '"+ekind+"'");
            return;
        }
        let target = {name: element.name, kind: kind, src_path: element.src_path};
        targets.push(target);
    });
    return targets;
}

// Finds the crate root for the given file if any
export function findCrateRoot(memberFilePath: string): string | null {
    // Check to see if this is the crate root. (Or a very badly named source file)
    if (fs.existsSync(path.join(memberFilePath, "Cargo.toml"))) {
        return memberFilePath;
    }
    // Support build.rs
    let dir = path.dirname(memberFilePath);
    while (dir != "") {
        if (fs.existsSync(path.join(dir, "Cargo.toml"))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    console.log("ERR: Could not find crate root for '"+memberFilePath+"'");
    return null;
}