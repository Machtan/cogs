import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';

export class CrateRootNotFoundError {
    constructor(public filePath: string) {};
}

export enum TargetKind {
    Binary,
    Library,
    Example,
    Test,
}

export class Target {
    constructor(public name: string, public kind: TargetKind, public src_path: string, public crateRoot: string) {}

    lint_command(): string {
        let args = this.cargo_rustc_args();
        return `cargo rustc --message-format json ${args} -- -Zno-trans`;
    }

    run_command(): string {
        switch (this.kind) {
            case TargetKind.Binary: {
                return "cargo run --bin "+this.name;
            }
            case TargetKind.Library: {
                return "cargo build --lib";
            }
            case TargetKind.Example: {
                return "cargo run --example "+this.name;
            }
            case TargetKind.Test: {
                return "cargo test --test "+this.name;
            }
        }
    }

    cargo_rustc_args(): string {
        switch (this.kind) {
            case TargetKind.Binary: {
                return " --bin "+this.name;
            }
            case TargetKind.Library: {
                return " --lib ";
            }
            case TargetKind.Example: {
                return " --example "+this.name;
            }
            case TargetKind.Test: {
                return " --test "+this.name;
            }
        }
    }

    toString(): string {
        let kindName;
        if (this.kind === TargetKind.Binary) {
            kindName = "Binary";
        } else if (this.kind === TargetKind.Library) {
            kindName = "Library";
        } else if (this.kind === TargetKind.Example) {
            kindName = "Example";
        } else if (this.kind === TargetKind.Test) {
            kindName = "Test";
        }
        return `Target { name: ${this.name}, kind: ${kindName}, src_path: '${this.src_path}'}`;
    }
}

// Gets the target for running or building this file
export function getFileTarget(filePath: string, isRunTarget: boolean): Target {
    let crateRoot = findCrateRoot(filePath);
    let targets = getProjectTargets(crateRoot);
    return findTargetForFile(filePath, targets, isRunTarget);
}

// Finds the targets of the project the given file is part of, using 'cargo metadata'
// TODO: Cache this and watch cargo.toml?
export function getProjectTargets(crateRoot: string): Target[] {
    let output;
    let cmd = "cargo metadata --no-deps";
    console.log("RUN >> "+cmd);
    try {
        output = child_process.execSync(cmd, {cwd: crateRoot}).toString("utf-8");
    } catch (e) {
        console.log(`ERR: Could not run '${cmd}' inside '${crateRoot}'`);
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
        } else if (ekind === "test") {
            kind = TargetKind.Test;
        } else {
            console.log("ERR: UNSUPPORTED TARGET KIND: '"+ekind+"'");
            return;
        }
        let target = new Target(element.name, kind, element.src_path, crateRoot);
        targets.push(target);
    });
    return targets;
}

// Finds the fitting cargo target for running the given file
export function findTargetForFile(filePath: string, targets: Target[], isRunTarget: boolean): Target {
    let binCount = 0;
    let hasLib = false;
    for (let target of targets) {
        // If the filename is one of the targets: use it
        if (target.src_path === filePath) {
            return target;
        }
        if (target.kind === TargetKind.Binary) {
            binCount += 1;
        } else if (target.kind === TargetKind.Library) {
            hasLib = true;
        }
    }
    // Otherwise prioritise bin/lib targets based on the 'isRunTarget' parameter
    if (isRunTarget) {
        if (binCount === 1) {
            return targets.find(target => target.kind === TargetKind.Binary);
        } else if (binCount > 1) {
            let target = targets.find(target => target.kind === TargetKind.Binary);
            console.log(`ERR: Multiple [bin] targets for project, using first: '${target.name}'`)
            return target;
        } else if (hasLib) {
            return targets.find(target => target.kind === TargetKind.Library);
        }
    } else {
        if (hasLib) {
            return targets.find(target => target.kind === TargetKind.Library);
        } else if (binCount === 1) {
            return targets.find(target => target.kind === TargetKind.Binary);
        } else if (binCount > 1) {
            let target = targets.find(target => target.kind === TargetKind.Binary);
            console.log(`ERR: Multiple [bin] targets for project, using first: '${target.name}'`)
            return target;
        }
    }
}

// Cache for crate roots
let crateRoots = [];
// Finds the crate root for the given file if any
export function findCrateRoot(memberFilePath: string): string {
    for (let root of crateRoots) {
        if (memberFilePath.startsWith(root)) {
            return root;
        }
    }
    // Check to see if this is the crate root. (Or a very badly named source file)
    if (fs.existsSync(path.join(memberFilePath, "Cargo.toml"))) {
        crateRoots.push(memberFilePath);
        return memberFilePath;
    }
    // Support build.rs
    let dir = path.dirname(memberFilePath);
    while (dir != "") {
        if (fs.existsSync(path.join(dir, "Cargo.toml"))) {
            crateRoots.push(dir);
            return dir;
        }
        dir = path.dirname(dir);
    }
    throw new CrateRootNotFoundError(memberFilePath);
}