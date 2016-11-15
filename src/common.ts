import * as path from 'path';
import * as fs from 'fs';

export function findCrateRoot(memberFilePath: string): string | null {
    // Support build.rs
    let dir = path.dirname(memberFilePath);
    while (dir != "") {
        if (fs.existsSync(path.join(dir, "Cargo.toml"))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    return null;
}