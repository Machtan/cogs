import {workspace} from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export enum CheckVersion {
    Official, // Has build.rs support
    Unofficial,
}

export function determineCheckType(): CheckVersion | null {
    try {
        let cmd = "cargo --version"
        let output = child_process.execSync(cmd).toString("utf-8");
        let semver = output.match("[0-9]+\\.[0-9]+(\\.[0-9]+)?")[0];
        let parts = semver.split(".");
        let major = parseInt(parts[0]);
        let minor = parseInt(parts[1]);
        if (major >= 0 && minor >= 16) {
            return CheckVersion.Official;
        } else {
            return CheckVersion.Unofficial;
        }
    } catch (e) { 
        return null;
    }
}

export class Profile {
    // Settings
    public runLinterOnSave: boolean;

    // Capabilities/versions
    public checkVersion: CheckVersion;

    constructor() {
        this.update();
    }

    update() {
        this.updateSettings();
        this.updateCapabilities();
    }

    updateSettings() {
        let settings = workspace.getConfiguration("cogs");
        this.runLinterOnSave = settings["runLinterOnSave"];
    }

    updateCapabilities() {
        this.checkVersion = determineCheckType();
    }

    toString() {
        let checkVersion = (this.checkVersion == CheckVersion.Unofficial? "un": "") + "official";
        return `Profile { 
            Settings: { 
                runLinterOnSave: ${this.runLinterOnSave}
            }, 
            Capabilities: {
                checkVersion: ${checkVersion}
            }
        }`;
    }

}
