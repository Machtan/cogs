import {workspace} from 'vscode';

export class Settings {
    public runLinterOnSave: boolean;
    constructor() {
        this.update();
    }

    update() {
        let settings = workspace.getConfiguration();
        this.runLinterOnSave = settings["runLinterOnSave"];
    }
}